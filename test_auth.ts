import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const email = "uat_test_user@copycanto.app";
const password = "securepassword123";

async function testAuth() {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log("Success! Signed in. UID:", cred.user.uid);
    process.exit(0);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        console.log("Success! Created user. UID:", cred.user.uid);
        process.exit(0);
      } catch (createErr: any) {
        console.error("Failed to create user:", createErr.code, createErr.message);
        process.exit(1);
      }
    } else {
      console.error("Sign in failed:", err.code, err.message);
      process.exit(1);
    }
  }
}

testAuth();
