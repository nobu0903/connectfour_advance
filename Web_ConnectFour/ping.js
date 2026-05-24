const https = require('https');

exports.handler = async (event, context) => {
    const base = process.env.APP_URL || 'https://connectfour-advance.onrender.com';
    const url = `${base.replace(/\/$/, '')}/ping`;

    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = '';

            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const redirectUrl = res.headers.location;
                console.log(`Redirect location: ${redirectUrl}`);
                
                // Follow redirect with a new request
                https.get(redirectUrl, (redirectRes) => {
                    let redirectData = '';
                    
                    redirectRes.on('data', (chunk) => {
                        redirectData += chunk;
                    });

                    redirectRes.on('end', () => {
                        if (redirectRes.statusCode === 200) {
                            try {
                                const responseData = JSON.parse(redirectData);
                                resolve({
                                    statusCode: 200,
                                    body: responseData,
                                    timestamp: new Date().toISOString()
                                });
                            } catch (error) {
                                reject(new Error(`JSON parse error: ${error.message}`));
                            }
                        } else {
                            reject(
                                new Error(`Server ping failed: status ${redirectRes.statusCode}, body: ${redirectData}`)
                            );
                        }
                    });
                }).on('error', (error) => {
                    reject(new Error(`Redirect request error: ${error.message}`));
                });
            } else {
                // Normal response
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const responseData = JSON.parse(data);
                            resolve({
                                statusCode: 200,
                                body: responseData,
                                timestamp: new Date().toISOString()
                            });
                        } catch (error) {
                            reject(new Error(`JSON parse error: ${error.message}`));
                        }
                    } else {
                        reject(
                            new Error(`Server ping failed: status ${res.statusCode}, body: ${data}`)
                        );
                    }
                });
            }
        });

        req.on('error', (error) => {
            reject(new Error(`Request error: ${error.message}`));
        });
        //error handling
        req.setTimeout(10000, () => {
            req.abort();
            reject(new Error('Ping request timed out (10s)'));
        });

        req.end();
    });
}; 