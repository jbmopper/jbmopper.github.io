/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/zrender@5.6.1/lib/graphic/helper/subPixelOptimize.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var t=Math.round;function r(r,i,n){if(i){var x=i.x1,a=i.x2,e=i.y1,u=i.y2;r.x1=x,r.x2=a,r.y1=e,r.y2=u;var y=n&&n.lineWidth;return y?(t(2*x)===t(2*a)&&(r.x1=r.x2=h(x,y,!0)),t(2*e)===t(2*u)&&(r.y1=r.y2=h(e,y,!0)),r):r}}function i(t,r,i){if(r){var n=r.x,x=r.y,a=r.width,e=r.height;t.x=n,t.y=x,t.width=a,t.height=e;var u=i&&i.lineWidth;return u?(t.x=h(n,u,!0),t.y=h(x,u,!0),t.width=Math.max(h(n+a,u,!1)-t.x,0===a?0:1),t.height=Math.max(h(x+e,u,!1)-t.y,0===e?0:1),t):t}}function h(r,i,h){if(!i)return r;var n=t(2*r);return(n+t(i))%2==0?n/2:(n+(h?1:-1))/2}export{h as subPixelOptimize,r as subPixelOptimizeLine,i as subPixelOptimizeRect};export default null;
