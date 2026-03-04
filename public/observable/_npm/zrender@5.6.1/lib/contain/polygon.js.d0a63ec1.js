/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/zrender@5.6.1/lib/contain/polygon.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function r(r,n,t,e,u,a){if(a>n&&a>e||a<n&&a<e)return 0;if(e===n)return 0;var f=(a-n)/(e-n),i=e<n?1:-1;1!==f&&0!==f||(i=e<n?.5:-.5);var o=f*(t-r)+r;return o===u?1/0:o>u?i:0}function n(r,n){return Math.abs(r-n)<1e-8}function t(t,e,u){var a=0,f=t[0];if(!f)return!1;for(var i=1;i<t.length;i++){var o=t[i];a+=r(f[0],f[1],o[0],o[1],e,u),f=o}var v=t[0];return n(f[0],v[0])&&n(f[1],v[1])||(a+=r(f[0],f[1],v[0],v[1],e,u)),0!==a}export{t as contain};export default null;
