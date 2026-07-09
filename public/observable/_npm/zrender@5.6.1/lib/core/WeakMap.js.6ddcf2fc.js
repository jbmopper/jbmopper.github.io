/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/zrender@5.6.1/lib/core/WeakMap.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var i=Math.round(Math.random()*9),o=typeof Object.defineProperty=="function",u=(function(){function e(){this._id="__ec_inner_"+i++}return e.prototype.get=function(t){return this._guard(t)[this._id]},e.prototype.set=function(t,r){var n=this._guard(t);return o?Object.defineProperty(n,this._id,{value:r,enumerable:!1,configurable:!0}):n[this._id]=r,this},e.prototype.delete=function(t){return this.has(t)?(delete this._guard(t)[this._id],!0):!1},e.prototype.has=function(t){return!!this._guard(t)[this._id]},e.prototype._guard=function(t){if(t!==Object(t))throw TypeError("Value of WeakMap is not a non-null object.");return t},e})();export{u as default};
