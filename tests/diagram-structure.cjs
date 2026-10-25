/* Historical layout tests compare the complete vector outside node styling.
 * Keep group identities/transforms, every printed title/caption, all edge paths,
 * port labels, dimensions and quality metadata exact. The separately tested arrow-head definition, node outlines, text
 * alignment, tooltip formatting and CSS intentionally changed with the style.
 */
'use strict';
module.exports=svg=>svg.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<marker id="paper-arrow"[^>]*>[\s\S]*?<\/marker>/g,'<marker id="paper-arrow"/>').replace(/<g class="node"([^>]*)>([\s\S]*?)<\/g>/g,(_,attrs,body)=>{
 const text=[...body.matchAll(/<text\b[^>]*class="paper-(?:title|caption)[^"]*"[^>]*>([\s\S]*?)<\/text>/g)].map(m=>m[1].replace(/<[^>]*>/g,''));
 return '<g class="node"'+attrs+'>'+JSON.stringify(text)+'</g>';
});
