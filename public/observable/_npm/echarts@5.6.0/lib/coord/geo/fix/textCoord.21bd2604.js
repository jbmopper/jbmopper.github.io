/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/echarts@5.6.0/lib/coord/geo/fix/textCoord.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var s={\u5357\u6D77\u8BF8\u5C9B:[32,80],\u5E7F\u4E1C:[0,-10],\u9999\u6E2F:[10,5],\u6FB3\u95E8:[-10,10],\u5929\u6D25:[5,5]};function n(f,e){if(f==="china"){var t=s[e.name];if(t){var a=e.getCenter();a[0]+=t[0]/10.5,a[1]+=-t[1]/(10.5/.75),e.setCenter(a)}}}export{n as default};
