/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/zrender@5.6.1/lib/contain/line.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function r(r,t,e,n,u,a,f){if(0===u)return!1;var i=u,l=0;if(f>t+i&&f>n+i||f<t-i&&f<n-i||a>r+i&&a>e+i||a<r-i&&a<e-i)return!1;if(r===e)return Math.abs(a-r)<=i/2;var o=(l=(t-n)/(r-e))*a-f+(r*n-e*t)/(r-e);return o*o/(l*l+1)<=i/2*i/2}export{r as containStroke};export default null;
