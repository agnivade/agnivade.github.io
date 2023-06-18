---
layout: post
title: Encrypting your root partition in-place without reinstalling Ubuntu
categories: [encryption]
tags: [ubuntu, encryption, disk]
fullview: true
comments: true
---

### Introduction

Last month my workplace enforced the requirement to have our laptop disks to be fully encypted. The only niggle was that I had already been using my laptop for several years and wasn't terribly looking forward to setting up everything from scratch. I was left with two options:
1. Set a weekend aside, take a full backup and reinstall everything, along with encryption this time.
2. Take a braver approach and try to encrypt in-place.

It doesn't take a genius to figure out that it doesn't hurt to try #2 first, and then #1 if that fails. So that's what I did, and was successful with #2. I captured my whole process for posterity. Most of it is from this great guide: https://opencraft.com/tutorial-encrypting-an-existing-root-partition-in-ubuntu-with-dm-crypt-and-luks/ which worked out perfect for me. Except for some minor places which needed modifications.

Following is an account of what happened. This is on an Ubuntu 22.04.2 OS.

### Steps

1. Boot from an Ubuntu live USB.
2. First, you need to find the device numbers of your partitions. You can run `fdisk -l` to find them out.

  This is how mine looked:

  ```
  /dev/nvme0n1p1    2048    1050623   1048576   512M EFI System
  /dev/nvme0n1p2 1050624 1000214527 999163904 476.4G Linux filesystem
  ```

3. Resize your root filesystem

  ```
  sudo e2fsck -f /dev/nvme0n1p2 # say yes to optimizing extent trees
  sudo resize2fs -M /dev/nvme0n1p2
  sudo cryptsetup-reencrypt /dev/nvme0n1p2 --new --reduce-device-size 16M --type=luks1
  sudo cryptsetup open /dev/nvme0n1p2 rootfs
  sudo resize2fs /dev/mapper/rootfs
  ```

4. Post-encryption stuff

  ```
  sudo mount /dev/mapper/rootfs /mnt
  sudo mount /dev/nvme0n1p1 /mnt/boot/efi
  sudo mount --bind /dev /mnt/dev
  sudo mount --bind /dev/pts /mnt/dev/pts
  sudo mount --bind /sys /mnt/sys
  sudo mount --bind /proc /mnt/proc
  sudo chroot /mnt
  ```

5. Now inside root shell, run these:

  ```
  mkdir /etc/luks
  dd if=/dev/urandom of=/etc/luks/boot_os.keyfile bs=4096 count=1
  chmod u=rx,go-rwx /etc/luks
  chmod u=r,go-rwx /etc/luks/boot_os.keyfile
  cryptsetup luksAddKey /dev/nvme0n1p2 /etc/luks/boot_os.keyfile
  ```

6. Find the encrypted UUID for `/dev/nvme0n1p2` by running `blkid -s UUID -o value /dev/nvme0n1p2`. Note it down.

7. Add the following line to /etc/crypttab:

  ```
  rootfs UUID=<UUID from before> /etc/luks/boot_os.keyfile luks,discard
```

8. Remove the existing root partition line from /etc/fstab and add the following line:

  ```
  /dev/mapper/rootfs / ext4 errors=remount-ro 0 1
  ```

9. In `/etc/default/grub`, remove the existing reference to the root partition from `GRUB_CMDLINE_LINUX` and add the following line:

  ```
  GRUB_ENABLE_CRYPTODISK=y
  ```

10. Then run:

  ```
  grub-install
  update-grub
  ```

11. Make sure that the GRUB configuration file at /boot/grub/grub.cfg was updated correctly by update-grub. In "menuentry Ubuntu", there should be atleast `insmod cryptodisk`, and `insmod luks`

12. Set the KEYFILE_PATTERN in `/etc/cryptsetup-initramfs/conf-hook` to `KEYFILE_PATTERN="/etc/boot/*.keyfile"`. (You can also set the umask if you want)

13. Then run:

  ```
  update-initramfs -k all -c
  exit
  umount -a
  ```

  Then remove the USB drive, and reboot your computer. Now you will be prompted to type the passphrase at boot. Enter that and Ubuntu will boot!

  Hopefully that was helpful. Note that all of this was done in Ubuntu 22.04.2. It might change in the later versions. Please feel free to comment in there's something that needs to change and I'd be glad to update them.

