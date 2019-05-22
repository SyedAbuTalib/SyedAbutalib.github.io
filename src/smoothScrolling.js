$(document).ready(function(){
    $( "a.nav-link" ).click(function( event ) {
        event.preventDefault();
        $("html, body").animate({ scrollTop: $($(this).attr("href")).offset().top - 70}, 500);
    });
});