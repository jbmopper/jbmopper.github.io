/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/echarts@5.6.0/lib/data/OrdinalMeta.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{map as e,isString as t,createHashMap as i,isObject as r}from"../../../zrender@5.6.1/lib/core/util.js.6eaf82a7.js";var n=0,o=function(){function r(e){this.categories=e.categories||[],this._needCollect=e.needCollect,this._deduplication=e.deduplication,this.uid=++n}return r.createByAxisModel=function(t){var i=t.option,n=i.data,o=n&&e(n,a);return new r({categories:o,needCollect:!o,deduplication:!1!==i.dedplication})},r.prototype.getOrdinal=function(e){return this._getOrCreateMap().get(e)},r.prototype.parseAndCollect=function(e){var i,r=this._needCollect;if(!t(e)&&!r)return e;if(r&&!this._deduplication)return i=this.categories.length,this.categories[i]=e,i;var n=this._getOrCreateMap();return null==(i=n.get(e))&&(r?(i=this.categories.length,this.categories[i]=e,n.set(e,i)):i=NaN),i},r.prototype._getOrCreateMap=function(){return this._map||(this._map=i(this.categories))},r}();function a(e){return r(e)&&null!=e.value?e.value:e+""}export{o as default};
