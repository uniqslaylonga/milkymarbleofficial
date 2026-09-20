// public/employee/salesOfficer/js/salesCommon.js
//
// Shared helpers for every Sales Officer page. Load this BEFORE the page's own
// script. It exists so that:
//   1. dates are compared in Philippine time (Asia/Manila), not UTC - otherwise
//      "Today" rolls over at 8:00 AM instead of midnight;
//   2. when the API/Supabase fails, the page says so instead of silently
//      showing made-up demo records.
(function () {
    const dateFmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });

    // Any Date / ISO string -> 'YYYY-MM-DD' in Manila time.
    function localDate(value) {
        const d = value instanceof Date ? value : new Date(value);
        return isNaN(d) ? '' : dateFmt.format(d);
    }

    // Reads the server's { message } from a failed response.
    async function errorMessage(response) {
        try {
            const body = await response.json();
            if (body && body.message) return body.message;
        } catch (e) { /* not JSON */ }
        return 'Server responded with status ' + response.status;
    }

    function showError(error) {
        let msg = (error && error.message) ? error.message : String(error || 'Unknown error');
        if (/failed to fetch|networkerror/i.test(msg)) msg = 'Cannot reach the server.';

        let banner = document.getElementById('salesApiError');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'salesApiError';
            banner.setAttribute('role', 'alert');
            banner.style.cssText = 'margin:0 0 16px;padding:12px 16px;border-radius:10px;' +
                'background:#fdecea;color:#8a1f17;border:1px solid #f3b7b1;font-size:14px;line-height:1.4;';
            const host = document.querySelector('.main-content') || document.body;
            host.insertBefore(banner, host.firstChild);
        }
        banner.textContent = 'Live data could not be loaded: ' + msg +
            ' Nothing on this page is sample data. Check the server logs and the Supabase connection, then refresh.';
    }

    // Replace every "Loading..." placeholder so the page doesn't spin forever.
    function failTables(text) {
        document.querySelectorAll('.loading-state-text').forEach(function (el) {
            el.textContent = text || 'Could not load data.';
        });
    }

    window.SalesCommon = { localDate: localDate, errorMessage: errorMessage, showError: showError, failTables: failTables };
})();
