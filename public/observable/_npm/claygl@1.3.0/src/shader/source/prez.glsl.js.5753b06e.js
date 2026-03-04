/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/claygl@1.3.0/src/shader/source/prez.glsl.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var n="@export clay.prez.vertex\nuniform mat4 WVP : WORLDVIEWPROJECTION;\nattribute vec3 pos : POSITION;\nattribute vec2 uv : TEXCOORD_0;\nuniform vec2 uvRepeat : [1.0, 1.0];\nuniform vec2 uvOffset : [0.0, 0.0];\n@import clay.chunk.skinning_header\n@import clay.chunk.instancing_header\nvarying vec2 v_Texcoord;\nvoid main()\n{\n vec4 P = vec4(pos, 1.0);\n#ifdef SKINNING\n @import clay.chunk.skin_matrix\n P = skinMatrixWS * P;\n#endif\n#ifdef INSTANCING\n @import clay.chunk.instancing_matrix\n P = instanceMat * P;\n#endif\n gl_Position = WVP * P;\n v_Texcoord = uv * uvRepeat + uvOffset;\n}\n@end\n@export clay.prez.fragment\nuniform sampler2D alphaMap;\nuniform float alphaCutoff: 0.0;\nvarying vec2 v_Texcoord;\nvoid main()\n{\n if (alphaCutoff > 0.0) {\n if (texture2D(alphaMap, v_Texcoord).a <= alphaCutoff) {\n discard;\n }\n }\n gl_FragColor = vec4(0.0,0.0,0.0,1.0);\n}\n@end";export{n as default};
