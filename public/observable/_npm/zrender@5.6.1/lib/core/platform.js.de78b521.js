/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/zrender@5.6.1/lib/core/platform.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var F=12,T="sans-serif",f=F+"px "+T,m=20,W=100,g="007LLmW'55;N0500LLLLLLLLLL00NNNLzWW\\\\WQb\\0FWLg\\bWb\\WQ\\WrWWQ000CL5LLFLL0LL**F*gLLLL5F0LF\\FFF5.5N";function l(r){var n={};if(typeof JSON>"u")return n;for(var a=0;a<r.length;a++){var e=String.fromCharCode(a+32),L=(r.charCodeAt(a)-m)/W;n[e]=L}return n}var i=l(g),v={createCanvas:function(){return typeof document<"u"&&document.createElement("canvas")},measureText:(function(){var r,n;return function(a,e){if(!r){var L=v.createCanvas();r=L&&L.getContext("2d")}if(r)return n!==e&&(n=r.font=e||f),r.measureText(a);a=a||"",e=e||f;var c=/((?:\d+)?\.?\d*)px/.exec(e),t=c&&+c[1]||F,o=0;if(e.indexOf("mono")>=0)o=t*a.length;else for(var u=0;u<a.length;u++){var d=i[a[u]];o+=d==null?t:d*t}return{width:o}}})(),loadImage:function(r,n,a){var e=new Image;return e.onload=n,e.onerror=a,e.src=r,e}};function _(r){for(var n in v)r[n]&&(v[n]=r[n])}export{f as DEFAULT_FONT,T as DEFAULT_FONT_FAMILY,F as DEFAULT_FONT_SIZE,i as DEFAULT_TEXT_WIDTH_MAP,v as platformApi,_ as setPlatformAPI};
