const { io } = require('socket.io-client');

const URL = 'http://localhost:3000';

const alice = io(URL);
alice.on('connect', () => {
    console.log('Alice connected');
    alice.emit('user_join', 'Alice');

    setTimeout(() => {
        console.log('Alice starts studying...');
        alice.emit('start_study', { username: 'Alice', subject: 'Math', startTime: Date.now() });
    }, 500);
});

setTimeout(() => {
    const bob = io(URL);
    bob.on('connect', () => {
        console.log('Bob connected');
        bob.emit('user_join', 'Bob');
    });

    bob.on('users_update', (users) => {
        const aliceData = users.find(u => u.username === 'Alice');
        if (aliceData && aliceData.isStudying) {
            console.log('\n=== USERS_UPDATE ===');
            users.forEach(u => {
                console.log(`${u.username}: isStudying=${u.isStudying}, studyElapsed=${u.studyElapsed}, studyStartTime=${u.studyStartTime}, subject=${u.subject}`);
            });
            console.log('\n=== DIAGNOSIS ===');
            console.log('studyElapsed:', aliceData.studyElapsed, '(type:', typeof aliceData.studyElapsed + ')');

            if (aliceData.studyElapsed != null && aliceData.studyElapsed >= 0) {
                console.log('OK: studyElapsed is present and valid');
            } else {
                console.log('FAIL: studyElapsed is missing');
            }

            setTimeout(() => { alice.close(); bob.close(); process.exit(0); }, 300);
        }
    });
}, 3500);

setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
