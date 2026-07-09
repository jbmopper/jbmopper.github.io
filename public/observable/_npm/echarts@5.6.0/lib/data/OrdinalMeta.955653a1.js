/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/echarts@5.6.0/lib/data/OrdinalMeta.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{map as n,isString as s,createHashMap as l,isObject as o}from"../../../zrender@5.6.1/lib/core/util.js.9f669920.js";var u=0,d=(function(){function i(e){this.categories=e.categories||[],this._needCollect=e.needCollect,this._deduplication=e.deduplication,this.uid=++u}return i.createByAxisModel=function(e){var t=e.option,a=t.data,r=a&&n(a,c);return new i({categories:r,needCollect:!r,deduplication:t.dedplication!==!1})},i.prototype.getOrdinal=function(e){return this._getOrCreateMap().get(e)},i.prototype.parseAndCollect=function(e){var t,a=this._needCollect;if(!s(e)&&!a)return e;if(a&&!this._deduplication)return t=this.categories.length,this.categories[t]=e,t;var r=this._getOrCreateMap();return t=r.get(e),t==null&&(a?(t=this.categories.length,this.categories[t]=e,r.set(e,t)):t=NaN),t},i.prototype._getOrCreateMap=function(){return this._map||(this._map=l(this.categories))},i})();function c(i){return o(i)&&i.value!=null?i.value:i+""}export{d as default};
