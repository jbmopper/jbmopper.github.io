/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/zrender@5.6.1/lib/graphic/helper/subPixelOptimize.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var l=Math.round;function m(r,i,f){if(i){var x=i.x1,y=i.x2,v=i.y1,g=i.y2;r.x1=x,r.x2=y,r.y1=v,r.y2=g;var n=f&&f.lineWidth;return n&&(l(x*2)===l(y*2)&&(r.x1=r.x2=d(x,n,!0)),l(v*2)===l(g*2)&&(r.y1=r.y2=d(v,n,!0))),r}}function b(r,i,f){if(i){var x=i.x,y=i.y,v=i.width,g=i.height;r.x=x,r.y=y,r.width=v,r.height=g;var n=f&&f.lineWidth;return n&&(r.x=d(x,n,!0),r.y=d(y,n,!0),r.width=Math.max(d(x+v,n,!1)-r.x,v===0?0:1),r.height=Math.max(d(y+g,n,!1)-r.y,g===0?0:1)),r}}function d(r,i,f){if(!i)return r;var x=l(r*2);return(x+l(i))%2===0?x/2:(x+(f?1:-1))/2}export{d as subPixelOptimize,m as subPixelOptimizeLine,b as subPixelOptimizeRect};
