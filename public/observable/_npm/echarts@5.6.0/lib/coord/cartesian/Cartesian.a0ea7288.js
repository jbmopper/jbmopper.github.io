/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/echarts@5.6.0/lib/coord/cartesian/Cartesian.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as s from"../../../../zrender@5.6.1/lib/core/util.js.9f669920.js";var r=(function(){function i(t){this.type="cartesian",this._dimList=[],this._axes={},this.name=t||""}return i.prototype.getAxis=function(t){return this._axes[t]},i.prototype.getAxes=function(){return s.map(this._dimList,function(t){return this._axes[t]},this)},i.prototype.getAxesByScale=function(t){return t=t.toLowerCase(),s.filter(this.getAxes(),function(e){return e.scale.type===t})},i.prototype.addAxis=function(t){var e=t.dim;this._axes[e]=t,this._dimList.push(e)},i})();export{r as default};
