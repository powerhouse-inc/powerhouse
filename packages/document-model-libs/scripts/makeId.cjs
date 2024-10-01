const crypto = require('crypto');

const hash = (data, algorithm = 'sha1') =>
    crypto.createHash(algorithm).update(data).digest('base64');

const hashKey = (date, randomLimit = 1000) => {
    const random = Math.random() * randomLimit;
    return hash(`${(date ?? new Date()).toISOString()}${random}`);
};

const count = parseInt(process.argv[2]) || 1;

for (let i = 0; i < count; i++) {
    console.log(hashKey());
}
