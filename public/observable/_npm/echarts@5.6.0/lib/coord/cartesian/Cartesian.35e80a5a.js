/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/echarts@5.6.0/lib/coord/cartesian/Cartesian.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as t from"../../../../zrender@5.6.1/lib/core/util.js.6eaf82a7.js";var e=function(){function e(t){this.type="cartesian",this._dimList=[],this._axes={},this.name=t||""}return e.prototype.getAxis=function(t){return this._axes[t]},e.prototype.getAxes=function(){return t.map(this._dimList,(function(t){return this._axes[t]}),this)},e.prototype.getAxesByScale=function(e){return e=e.toLowerCase(),t.filter(this.getAxes(),(function(t){return t.scale.type===e}))},e.prototype.addAxis=function(t){var e=t.dim;this._axes[e]=t,this._dimList.push(e)},e}();export{e as default};
