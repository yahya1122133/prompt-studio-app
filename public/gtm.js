// Google Tag Manager initialization - optimized for performance
(function(w,d,s,l,i){
  // Only load if GTM ID is available
  if (!i) return;
  
  w[l]=w[l]||[];
  w[l].push({'gtm.start': new Date().getTime(),event:'gtm.js'});
  
  // Delay GTM loading to not block LCP
  setTimeout(function() {
    var f=d.getElementsByTagName(s)[0],
    j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
    j.async=true;
    j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
    f.parentNode.insertBefore(j,f);
  }, 1000); // Delay by 1 second
})(window,document,'script','dataLayer',window.REACT_APP_GTM_ID);
