// Mock Firebase SDK for Local-Only Operation
export const auth = {
  currentUser: {
    uid: 'local-user',
    email: 'solo@operator.local',
    displayName: 'Solo Operator',
    photoURL: '/assets/monkey_avatar_1774000814815.png',
  },
  onAuthStateChanged: (callback: (user: any) => void) => {
    setTimeout(() => {
      callback({
        uid: 'local-user',
        email: 'solo@operator.local',
        displayName: 'Solo Operator',
        photoURL: '/assets/monkey_avatar_1774000814815.png',
      });
    }, 0);
    return () => {};
  },
  signOut: async () => {
    console.log("Logout disabled in local-only mode.");
  }
};

export const onAuthStateChanged = (authObj: any, callback: (user: any) => void) => {
  return auth.onAuthStateChanged(callback);
};

export type User = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
};

export const signInWithPopup = async () => {
  return { user: auth.currentUser };
};

async function apiFetch(path: string, method: string = 'GET', body?: any) {
  const options: RequestInit = {
    method,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    cache: 'no-store'
  };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const collection = (db: any, name: string) => name;
export const doc = (db: any, collection: string, id: string) => ({ collection, id });

export const getDocs = async (q: any) => {
  const collectionName = typeof q === 'string' ? q : q.collection;
  const constraints = typeof q === 'string' ? [] : q.constraints;

  let data = await apiFetch(`/api/db/${collectionName}`);
  
  // Basic filtering mock. Constraints are applied in the order supplied by the
  // caller (where → orderBy → limit), which matches how query() builds them.
  if (data && constraints) {
    constraints.forEach((c: any) => {
      if (c.type === 'where') {
        const { field, op, value } = c;
        data = data.filter((item: any) => {
          if (op === '==') return item[field] === value;
          if (op === 'in') return Array.isArray(value) && value.includes(item[field]);
          return true;
        });
      } else if (c.type === 'orderBy') {
        const { field, dir } = c;
        const mult = dir === 'desc' ? -1 : 1;
        data = [...data].sort((a: any, b: any) => {
          const av = a[field];
          const bv = b[field];
          // Push null/undefined to the end regardless of direction.
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (av < bv) return -1 * mult;
          if (av > bv) return 1 * mult;
          return 0;
        });
      } else if (c.type === 'limit') {
        if (typeof c.n === 'number' && c.n >= 0) data = data.slice(0, c.n);
      }
    });
  }

  return {
    docs: (data || []).map((item: any) => ({
      id: item.id,
      data: () => item
    }))
  };
};

export const getDoc = async (docRef: { collection: string, id: string }) => {
  try {
    const data = await apiFetch(`/api/db/${docRef.collection}/${docRef.id}`);
    return {
      exists: () => !!data,
      data: () => data,
      id: docRef.id
    };
  } catch (e) {
    return { exists: () => false, data: () => null, id: docRef.id };
  }
};

export const setDoc = async (docRef: { collection: string, id: string }, data: any) => {
  return apiFetch(`/api/db/${docRef.collection}`, 'POST', { id: docRef.id, ...data });
};

export const addDoc = async (collectionName: string, data: any) => {
  const id = Math.random().toString(36).substring(7);
  return apiFetch(`/api/db/${collectionName}`, 'POST', { id, ...data });
};

export const updateDoc = async (docRef: { collection: string, id: string }, data: any) => {
  return apiFetch(`/api/db/${docRef.collection}/${docRef.id}`, 'PATCH', { ...data });
};

export const deleteDoc = async (docRef: { collection: string, id: string }) => {
  return apiFetch(`/api/db/${docRef.collection}/${docRef.id}`, 'DELETE');
};

export function onSnapshot(
  q: any, 
  callback: (snapshot: any) => void, 
  errorCallback?: (error: any) => void
) {
  let isMounted = true;
  const poll = async () => {
    if (!isMounted) return;
    try {
      const snap = await getDocs(q);
      callback(snap);
    } catch (e) {
      if (errorCallback) errorCallback(e);
      else console.error("Snapshot error:", e);
    }
    if (isMounted) setTimeout(poll, 3000);
  };
  poll();
  return () => { isMounted = false; };
}

export const query = (col: string, ...constraints: any[]) => ({
  collection: col,
  constraints
});

export const where = (field: string, op: string, value: any) => ({ type: 'where', field, op, value });
export const orderBy = (field: string, dir: string = 'asc') => ({ type: 'orderBy', field, dir });
export const limit = (n: number) => ({ type: 'limit', n });
export const serverTimestamp = () => new Date().toISOString();

export const Timestamp = {
  now: () => new Date().toISOString(),
  fromDate: (date: Date) => date.toISOString()
};

export const db = {};
export const googleProvider = {};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error(`Local DB Error (${operationType} @ ${path}):`, error);
  throw error;
}
