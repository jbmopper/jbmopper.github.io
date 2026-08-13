/**
 * Bundled by jsDelivr using Rollup v2.79.2 and Terser v5.39.0.
 * Original file: /npm/claygl@1.3.0/src/shader/source/compositor/output.glsl.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var r="@export clay.compositor.output\n#define OUTPUT_ALPHA\nvarying vec2 v_Texcoord;\nuniform sampler2D texture;\n@import clay.util.rgbm\nvoid main()\n{\n vec4 tex = decodeHDR(texture2D(texture, v_Texcoord));\n gl_FragColor.rgb = tex.rgb;\n#ifdef OUTPUT_ALPHA\n gl_FragColor.a = tex.a;\n#else\n gl_FragColor.a = 1.0;\n#endif\n gl_FragColor = encodeHDR(gl_FragColor);\n#ifdef PREMULTIPLY_ALPHA\n gl_FragColor.rgb *= gl_FragColor.a;\n#endif\n}\n@end";export{r as default};
