/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/zrender@5.6.1/lib/core/WeakMap.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var t=Math.round(9*Math.random()),e="function"==typeof Object.defineProperty,r=function(){function r(){this._id="__ec_inner_"+t++}return r.prototype.get=function(t){return this._guard(t)[this._id]},r.prototype.set=function(t,r){var n=this._guard(t);return e?Object.defineProperty(n,this._id,{value:r,enumerable:!1,configurable:!0}):n[this._id]=r,this},r.prototype.delete=function(t){return!!this.has(t)&&(delete this._guard(t)[this._id],!0)},r.prototype.has=function(t){return!!this._guard(t)[this._id]},r.prototype._guard=function(t){if(t!==Object(t))throw TypeError("Value of WeakMap is not a non-null object.");return t},r}();export{r as default};
