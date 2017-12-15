---
layout: post
title: How to shrink an AWS EBS volume
categories: [aws]
tags: [aws, ebs, storage]
fullview: true
comments: true
---

Recently, I had a requirement to shrink the disk space of a machine I had setup. We had overestimated and decided to use lesser space until the need arises. I had setup a 1TB disk initially and we wanted it to be 100GB.

I thought it would be as simple as detaching the volume, setting the new values and be done with it. Turns out you can increase the disk space, but not decrease it. Bummer, now I need to do the shrinking manually.


### Disclaimer:

This is nearly taken verbatim from Matt Berther's post [https://matt.berther.io/2015/02/03/how-to-resize-aws-ec2-ebs-volumes/](https://matt.berther.io/2015/02/03/how-to-resize-aws-ec2-ebs-volumes) combined with [@sinnardem](https://matt.berther.io/2015/02/03/how-to-resize-aws-ec2-ebs-volumes/#comment-2581261172)'s suggestion. But I have showed the actual command outputs and updated some steps from my experience following the process.

_Note:_ This worked for me on an Ubuntu 16.04 OS. YMMV. Proceed with caution. __Take a snapshot of your volume before you do anything.__

### Basic idea:

We have a 1TB filesystem. Our target is to make it 100GB.

AWS stores all your data in EBS (Elastic Block Storage) which allows detaching volumes from one machine and attaching to another. We will use this to our advantage. We will create a 100GB volume, attach this newly created volume and the original volume to a temporary machine. From inside the machine, we will copy over the data from the original to the new volume. Detach both volumes and attach this new volume to our original machine. Easy peasy. :tada:

### Here we go !


1. Note the hostname of the current machine. It should be something like `ip-a-b-c-d`.

2. Shutdown the current machine. (Don't forget to take the snapshot !).

3. Detach the volume, name it as `original-volume` to avoid confusion.

4. Create a new ec2 instance with the same OS as the current machine with 100GB of storage. Note, that it has to be in the same availability zone.

5. Shutdown that machine

6. Detach the volume from the machine, name it as `new-volume` to avoid confusion.

7. Now create another new ec2 machine, t2.micro is fine. Again, this has to be in the same availability zone.

8. Boot up the machine. Log in.

9. Attach `original-volume` to this machine at /dev/sdf which will become /dev/xvdf1.

	Attach `new-volume` to this machine at /dev/sdg which will become /dev/xvdg1.

	It will take some time to attach because the machines are running. Do not attach while the machine is shut down because it will take the `original-volume` to be the root partition and boot into it. We do not want that. (This happened to me).

	We want the root partition to be the separate 8G disk of the t2.micro machine, and have 2 separate partitions to work with.

	After the attachment is complete (you will see so in the aws ec2 console), do a `lsblk`. Check that you can see the partitions.

	```bash
	$lsblk
	NAME    MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
	xvda    202:0    0    8G  0 disk
	└─xvda1 202:1    0    8G  0 part /
	xvdf    202:80   0 1000G  0 disk  --> original-volume
	└─xvdf1 202:81   0 1000G  0 part
	xvdg    202:96   0  100G  0 disk  --> new-volume
	└─xvdg1 202:97   0  100G  0 part
	```

	We are now all set to do the data transfer.

10. First, check filesystem integrity of the original volume.

	```bash
	ubuntu@ip-172-31-12-57:~$ sudo e2fsck -f /dev/xvdf1
	e2fsck 1.42.13 (17-May-2015)
	Pass 1: Checking inodes, blocks, and sizes
	Pass 2: Checking directory structure
	Pass 3: Checking directory connectivity
	Pass 4: Checking reference counts
	Pass 5: Checking group summary information
	cloudimg-rootfs: 175463/128000000 files (0.1% non-contiguous), 9080032/262143739 blocks
	```

11. Resize the filesytem to the partition's size.

	```bash
	ubuntu@ip-172-31-12-57:~$ sudo resize2fs -M -p /dev/xvdf1
	resize2fs 1.42.13 (17-May-2015)
	Resizing the filesystem on /dev/xvdf1 to 1445002 (4k) blocks.
	Begin pass 2 (max = 492123)
	Relocating blocks             XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
	Begin pass 3 (max = 8000)
	Scanning inode table          XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
	Begin pass 4 (max = 31610)
	Updating inode references     XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
	The filesystem on /dev/xvdf1 is now 1445002 (4k) blocks long.
	```

12. Take the number from the previous step and calculate how many 16MB blocks would be required.
	```bash
	ubuntu@ip-172-31-12-57:~$ echo $((1445002*4/(16*1024)))
	352
	```

	Let's round it off to 355.

13. Start the copy.
	```bash
	ubuntu@ip-172-31-12-57:~$ sudo dd bs=16M if=/dev/xvdf1 of=/dev/xvdg1 count=355
	355+0 records in
	355+0 records out
	5955911680 bytes (6.0 GB, 5.5 GiB) copied, 892.549 s, 6.7 MB/s
	```

14. Double check that all changes are synced to disk.
	```bash
	ubuntu@ip-172-31-12-57:~$ sync
	```

15. Resize the new volume.
	```bash
	ubuntu@ip-172-31-12-57:~$ sudo resize2fs -p /dev/xvdg1
	resize2fs 1.42.13 (17-May-2015)
	Resizing the filesystem on /dev/xvdg1 to 26214139 (4k) blocks.
	The filesystem on /dev/xvdg1 is now 26214139 (4k) blocks long.
	```

16. Check for filesystem integrity.
	```bash
	ubuntu@ip-172-31-12-57:~$ sudo e2fsck -f /dev/xvdg1
	e2fsck 1.42.13 (17-May-2015)
	Pass 1: Checking inodes, blocks, and sizes
	Pass 2: Checking directory structure
	Pass 3: Checking directory connectivity
	Pass 4: Checking reference counts
	Pass 5: Checking group summary information
	cloudimg-rootfs: 175463/12800000 files (0.1% non-contiguous), 1865145/26214139 blocks
	```

17. Shutdown the machine.

18. Detach both volumes.

19. Attach the `new-volume` to your original machine.

20. Login to the machine. You will see that the hostname is set to the machine from where you created the volume. We need to set to the original hostname.

	```bash
	sudo hostnamectl set-hostname ip-a-b-c-d
	```

21. Reboot.

That should be it. If you find anything that has not worked for you or you have a better method, please feel free to let me know in the comments !

