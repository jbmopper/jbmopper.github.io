/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/echarts@5.6.0/lib/coord/geo/fix/textCoord.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var e={"南海诸岛":[32,80],"广东":[0,-10],"香港":[10,5],"澳门":[-10,10],"天津":[5,5]};function a(a,t){if("china"===a){var n=e[t.name];if(n){var r=t.getCenter();r[0]+=n[0]/10.5,r[1]+=-n[1]/14,t.setCenter(r)}}}export{a as default};
