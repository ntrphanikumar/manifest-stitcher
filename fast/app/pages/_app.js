
function MyApp({ Component, pageProps }) {
  // Use the layout defined at the page level, if available
  // if browser is closed cookie gets expired so clearing localStorage
//NOTE: Commenting below code as it is possible cause for issue (working in incognito mode only)
//  if(process.browser){
//    if(document.cookie.indexOf('Jwt-token')!==0){
//        localStorage.clear();
//    }
//}
  const getLayout = Component.getLayout || ((page) => page)
  return getLayout(<Component {...pageProps} />)
}

export default MyApp
