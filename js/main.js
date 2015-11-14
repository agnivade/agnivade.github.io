var currentCard = "";
$(document).ready(function() {

  $(".item").click(function(e) {
    e.preventDefault();
    var scope = this;
    if (!currentCard) {
      // then show
      currentCard = $(scope).attr("data-link");
      // Check the current div, if there, slide it up
      // Slide in the new div
      $(currentCard).show("slide", {direction: "down"}, 1000);
    } else{
      // hide then show
      $(currentCard).hide("slide", {direction: "up"}, 1000, function(){
      // Updating the url
      currentCard = $(scope).attr("data-link");
      // Check the current div, if there, slide it up
      // Slide in the new div
      $(currentCard).show("slide", {direction: "down"}, 1000);
      });
    }
  });
  $(".card").hide();
});


