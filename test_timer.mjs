import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';

// Alice connects and starts studying
const alice = io(URL);
alice.on('connect', () => {
    console.log('Alice connected');
    alice.emit('user_join', 'Alice');

    setTimeout(() => {
        console.log('Alice starts studying...');
        alice.emit('start_study', { username: 'Alice', subject: 'Math', startTime: Date.now() });
    }, 500);
});

// Bob connects 3 seconds later and checks the data
setTimeout(() => {
    const bob = io(URL);
    bob.on('connect', () => {
        console.log('Bob connected');
        bob.emit('user_join', 'Bob');
    });

    bob.on('users_update', (users) => {
        console.log('\n=== USERS_UPDATE received by Bob ===');
        users.forEach(u => {
            console.log(`  User: ${u.username}`);
            console.log(`    isStudying: ${u.isStudying}`);
            console.log(`    studyStartTime: ${u.studyStartTime}`);
            console.log(`    studyElapsed: ${u.studyElapsed}`);
            console.log(`    subject: ${u.subject}`);
        });

        const aliceData = users.find(u => u.username === 'Alice');
        if (aliceData && aliceData.isStudying) {
            console.log('\n=== DIAGNOSIS ===');
            console.log(`studyElapsed is: ${aliceData.studyElapsed} (type: ${typeof aliceData.studyElapsed})`);
            console.log(`studyStartTime is: ${aliceData.studyStartTime} (type: ${typeof aliceData.studyStartTime})`);

            if (aliceData.studyElapsed != null && aliceData.studyElapsed >= 0) {
                const localStart = Date.now() - aliceData.studyElapsed * 1000;
                const elapsed = Math.floor((Date.now() - localStart) / 1000);
                console.log(`Client would compute localStart: ${localStart}`);
                console.log(`Client would show elapsed: ${elapsed}s`);
                console.log('SUCCESS: studyElapsed is being sent correctly!');
            } else {
                console.log('FAIL: studyElapsed is missing or invalid!');
            }

            setTimeout(() => {
                alice.close();
                bob.close();
                process.exit(0);
            }, 500);
        }
    });
}, 3500);

setTimeout(() => {
    console.log('TIMEOUT: Test timed out');
    process.exit(1);
}, 10000);
