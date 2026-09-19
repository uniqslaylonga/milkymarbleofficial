// public/employee/js/employeeAuth.js
//
// Shared by the Finance, Inventory and Production dashboards.
//
// The employee API (src/routes/employeeRoutes.js) works out who is logged in
// from the 'x-user-id' header. employeelogin.js saves that id to
// localStorage('userId') at login. Without this header the server can't look
// up the employee, so it falls back to a generic "Employee" label instead of
// the user's full name.
//
// Use employeeFetch() exactly like fetch() for any /api/... call.
(function () {
    function getUserId() {
        try {
            return localStorage.getItem('userId') || sessionStorage.getItem('userId') || '';
        } catch (e) {
            return '';
        }
    }

    window.employeeFetch = function (url, options) {
        const opts = Object.assign({}, options || {});
        const headers = Object.assign({}, opts.headers || {});
        const userId = getUserId();
        if (userId) headers['x-user-id'] = userId;
        opts.headers = headers;
        return fetch(url, opts);
    };
})();
