/*
 * namnskylt.com — skylten på er egen sajt.
 * <div data-namnskylt="er-butik"></div>
 * <script src="https://www.namnskylt.com/embed.js" async></script>
 */
(function () {
  var script = document.currentScript;
  var origin = script ? new URL(script.src).origin : "https://www.namnskylt.com";
  var SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

  function mount(el) {
    var slug = el.getAttribute("data-namnskylt");
    if (!slug || !SLUG.test(slug) || el.querySelector("iframe")) return;
    var frame = document.createElement("iframe");
    frame.src = origin + "/inbaddning/" + slug;
    frame.title = "Designa en namnskylt";
    frame.loading = "lazy";
    frame.allow = "clipboard-write";
    frame.setAttribute("allowtransparency", "true");
    frame.style.cssText = "display:block;width:100%;height:620px;border:0;background:transparent;color-scheme:normal";
    el.appendChild(frame);
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data || event.data.type !== "namnskylt:height") return;
    var frames = document.querySelectorAll("[data-namnskylt] iframe");
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) frames[i].style.height = Math.ceil(event.data.height) + "px";
    }
  });

  function mountAll() {
    var nodes = document.querySelectorAll("[data-namnskylt]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();
