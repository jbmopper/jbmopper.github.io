/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/zrender@5.6.1/lib/contain/polygon.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function c(t,r,u,a,n,e){if(e>r&&e>a||e<r&&e<a||a===r)return 0;var f=(e-r)/(a-r),i=a<r?1:-1;(f===1||f===0)&&(i=a<r?.5:-.5);var v=f*(u-t)+t;return v===n?1/0:v>n?i:0}var d=1e-8;function o(t,r){return Math.abs(t-r)<d}function l(t,r,u){var a=0,n=t[0];if(!n)return!1;for(var e=1;e<t.length;e++){var f=t[e];a+=c(n[0],n[1],f[0],f[1],r,u),n=f}var i=t[0];return(!o(n[0],i[0])||!o(n[1],i[1]))&&(a+=c(n[0],n[1],i[0],i[1],r,u)),a!==0}export{l as contain};
