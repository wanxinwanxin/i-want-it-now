// Small progressive enhancements. Every form also works without this script.
(function () {
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2400);
  }

  function post(form) {
    return fetch(form.action, {
      method: 'POST',
      headers: { 'x-ajax': '1', accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString(),
      credentials: 'same-origin',
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || 'Something went wrong.');
        return data;
      });
    });
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    var kind = form.getAttribute('data-ajax');
    if (!kind) return;
    e.preventDefault();
    if (kind === 'report' && !confirm('Report this as spam or abuse?')) return;
    post(form).then(function (data) {
      if (kind === 'metoo') {
        document.querySelectorAll('form.metoo[action="' + form.getAttribute('action') + '"] .mt').forEach(function (btn) {
          btn.classList.toggle('on', data.on);
          btn.setAttribute('aria-pressed', String(data.on));
          btn.querySelector('b').textContent = data.count;
        });
        if (data.on) toast('Counted. Share it so that more people see it.');
      } else if (kind === 'vote') {
        var card = form.closest('.answer');
        var btns = card.querySelectorAll('.vote:not(.fitbtn)');
        btns[0].querySelector('b').textContent = data.works;
        btns[1].querySelector('b').textContent = data.nofit;
        btns[0].classList.toggle('on', data.mine === 1);
        btns[1].classList.toggle('on', data.mine === -1);
      } else if (kind === 'report') {
        form.querySelector('button').textContent = 'Reported';
        form.querySelector('button').disabled = true;
      }
    }).catch(function (err) { toast(err.message); });
  });

  // Rotate the example text in the want box.
  var box = document.getElementById('want-text');
  if (box && box.dataset.examples) {
    var examples = JSON.parse(box.dataset.examples);
    var i = 0;
    setInterval(function () {
      if (box.value || document.activeElement === box) return;
      i = (i + 1) % examples.length;
      box.setAttribute('placeholder', examples[i]);
    }, 3500);

    // Show wants that already exist, so that people add a "me too" instead of a duplicate.
    var similar = document.getElementById('similar');
    var timer = null;
    var last = '';
    box.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var q = box.value.trim();
        if (q.length < 12 || q === last) { if (q.length < 12) similar.hidden = true; return; }
        last = q;
        fetch('/api/similar?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (data) {
          var list = (data.wants || []).slice(0, 3);
          if (!list.length) { similar.hidden = true; return; }
          similar.innerHTML = '';
          var p = document.createElement('p');
          p.textContent = 'Somebody may want this already. Add a “me too” there:';
          similar.appendChild(p);
          list.forEach(function (w) {
            var a = document.createElement('a');
            a.href = w.url.replace(/^https?:\/\/[^/]+/, '');
            a.textContent = w.title;
            var s = document.createElement('span');
            s.textContent = '▲ ' + w.me_too + ' · ' + w.status;
            a.appendChild(s);
            similar.appendChild(a);
          });
          similar.hidden = false;
        }).catch(function () {});
      }, 350);
    });

    // Enter posts the want. Shift+Enter makes a new line.
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (box.form.reportValidity()) box.form.requestSubmit();
      }
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-share]');
    if (!btn) return;
    var url = btn.getAttribute('data-share');
    var title = btn.getAttribute('data-title');
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast('Link copied.'); });
    } else {
      prompt('Copy this link:', url);
    }
  });
})();
