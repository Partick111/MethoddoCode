import{c as r,r as e}from"./index-49wxiESs.js";/**
 * @license lucide-vue-next v0.469.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const n=r("HeartIcon",[["path",{d:"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",key:"c3ymky"}]]);async function a(t){return e({url:`/articles/${encodeURIComponent(t)}/stats/`,method:"GET"})}async function o(t){return e({url:`/articles/${encodeURIComponent(t)}/view/`,method:"POST"})}async function s(t){return e({url:`/articles/${encodeURIComponent(t)}/like/`,method:"POST"})}async function i(t){return t.length?e({url:"/articles/stats/",method:"GET",params:{slugs:t.join(",")}}):[]}export{n as H,a,i as f,s as l,o as r};
