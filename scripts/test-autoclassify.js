const http = require('http');

const data = JSON.stringify({
    text: "Test issue for printer out of paper"
});

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/tasks/autoclassify',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer test-token-for-manager', // Assuming mock auth or we can use admin token
        'mock-user-id': '8', // For mock auth
        'mock-user-role': 'manager',
        'mock-winery-id': '1'
    }
};

const req = http.request(options, res => {
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', d => {
        process.stdout.write(d);
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
