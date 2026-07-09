/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/zrender@5.6.1/lib/contain/line.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function l(a,f,e,s,v,t,n){if(v===0)return!1;var r=v,u=0,o=a;if(n>f+r&&n>s+r||n<f-r&&n<s-r||t>a+r&&t>e+r||t<a-r&&t<e-r)return!1;if(a!==e)u=(f-s)/(a-e),o=(a*s-e*f)/(a-e);else return Math.abs(t-a)<=r/2;var _=u*t-n+o,i=_*_/(u*u+1);return i<=r/2*r/2}export{l as containStroke};
