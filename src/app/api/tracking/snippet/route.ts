import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.klinikaqma.com";

  const js = `(function(){
var BASE=${JSON.stringify(base)};
var p=new URLSearchParams(location.search);
function getCookie(name){var m=document.cookie.match('(?:^|;)\\\\s*'+name+'=([^;]*)');return m?decodeURIComponent(m[1]):null;}
function utm(){return{fbclid:p.get('fbclid'),campaignId:p.get('campaign_id'),adsetId:p.get('adset_id'),adId:p.get('ad_id'),utmSource:p.get('utm_source'),utmMedium:p.get('utm_medium'),utmCampaign:p.get('utm_campaign')};}
function buildExtra(){
  var keys=['fbclid','campaign_id','adset_id','ad_id','campaign_name','adset_name','ad_name','placement','site_source_name','utm_source','utm_medium','utm_campaign','utm_term','utm_content','ad_meta'];
  var parts=[];
  keys.forEach(function(k){var v=p.get(k);if(v)parts.push(k+'='+encodeURIComponent(v));});
  // Tambahkan _fbp cookie (Browser ID Meta Pixel) ke link agar bisa disimpan server
  var fbp=getCookie('_fbp');
  if(fbp)parts.push('fbp='+encodeURIComponent(fbp));
  return parts;
}
function firePageview(slug){
  var fbp=getCookie('_fbp');
  fetch(BASE+'/api/tracking/pageview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({slug:slug,fbp:fbp||null},utm())),mode:'cors',keepalive:true}).catch(function(){});
}
function init(){
  var extra=buildExtra();
  var links=document.querySelectorAll('a[href]');
  var slugMap={};
  var esc=BASE.replace(/[-\\/\\\\^+?.()|[\\]{}]/g,'\\\\$&');
  var re=new RegExp(esc+'\\/c\\/([a-z0-9][a-z0-9-]*)');
  links.forEach(function(a){
    var m=(a.getAttribute('href')||'').match(re);
    if(m&&m[1]){
      slugMap[m[1]]=true;
      if(extra.length){var sep=a.href.indexOf('?')>=0?'&':'?';a.href=a.href+sep+extra.join('&');}
    }
  });
  var slugs=Object.keys(slugMap);if(!slugs.length)return;
  slugs.forEach(function(slug){firePageview(slug);});
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
})();`;

  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
}
