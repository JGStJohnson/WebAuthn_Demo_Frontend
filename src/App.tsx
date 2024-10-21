import { useEffect, useState } from 'react'

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = window.atob(base64);
    const binaryLen = binaryString.length;
    const bytes = new Uint8Array(binaryLen);
    for (let i = 0; i < binaryLen; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
    const byteArray = new Uint8Array(arrayBuffer);
    let byteString = '';
    byteArray.forEach((byte) => {
        byteString += String.fromCharCode(byte);
    });
    return btoa(byteString);
}

function arrayBufferToBase64Url(arrayBuffer: ArrayBuffer): string {
    const base64 = arrayBufferToBase64(arrayBuffer);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function App() {
    const [isWebAuthnSupported, setIsWebAuthnSupported] = useState<boolean>(false);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [registering, setRegistering] = useState<boolean>(false);
    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [displayName, setDisplayName] = useState<string>('');

    useEffect(() => {
        if (window.PublicKeyCredential) {
            setIsWebAuthnSupported(true);
        }
    }, [accessToken]);

    function swapAuthType(isRegistering: boolean) {
        setPassword('');
        setDisplayName('');
        setRegistering(isRegistering);
    }

    function login() {
        const form = new FormData();
        form.append('username', username);
        form.append('password', password);

        fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
            method: 'POST',
            body: form
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Invalid credentials');
                }

                return response.text();
            })
            .then((token) => {
                setAccessToken(token);
            })
            .catch((error) => {
                console.error(error);
                alert('Invalid credentials');
            });
    }

    function register() {
        const form = new FormData();
        form.append('username', username);
        form.append('password', password);
        form.append('displayName', displayName);

        fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
            method: 'POST',
            body: form
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Failed to register');
                }

                return response.text();
            })
            .then((token) => {
                setAccessToken(token);
            })
            .catch((error) => {
                console.error(error);
                alert('Failed to register');
            }
            )
    }

    function loginWebAuthn() {
        const formData = new FormData();
        formData.append('username', username);

        fetch(`${import.meta.env.VITE_API_URL}/api/webauthn/login/options`, {
            method: 'POST',
            body: formData,
        })
            .then((response) => {
                if (response.status === 401) {
                    setAccessToken(null);
                    throw new Error('Unauthorized');
                }
                if (!response.ok) {
                    throw new Error('Failed to get login options');
                }

                return response.json();
            })
            .then((options) => {
                options.challenge = base64ToArrayBuffer(options.challenge);
                navigator.credentials.get({
                    publicKey: options
                })
                    .then((credential) => {
                        if (!credential) {
                            throw new Error('Failed to get credential');
                        }

                        const form = new FormData();
                        form.append('username', username);
                        form.append('credentialId', credential.id);

                        fetch(`${import.meta.env.VITE_API_URL}/api/webauthn/login/complete`, {
                            method: 'POST',
                            body: form
                        })
                            .then((response) => {
                                if (!response.ok) {
                                    throw new Error('Failed to login');
                                }

                                return response.json();
                            })
                            .then((newToken) => {
                                setAccessToken(newToken);
                            })
                            .catch((error) => {
                                console.error(error);
                                alert('Failed to login');
                            });
                    })
                    .catch((error) => {
                        console.error(error);
                        alert('Failed to get credential');
                    });
            })
            .catch((error) => {
                console.error(error);
                alert(error);
            });
    }

    function registerWebAuthn() {
        fetch(`${import.meta.env.VITE_API_URL}/api/webauthn/register/options`, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${accessToken}`
            }
        })
            .then((response) => {
                if (response.status === 401) {
                    setAccessToken(null);
                    throw new Error('Unauthorized');
                }
                if (!response.ok) {
                    throw new Error(`Failed to get registration options: ${response.statusText}, ${response.status}`);
                }

                return response.json();
            })
            .then((options) => {
                console.log(options);
                options.challenge = base64ToArrayBuffer(options.challenge);
                options.user.id = base64ToArrayBuffer(options.user.id);
                return navigator.credentials.create({
                    publicKey: options
                })
            })
            .then((credential) => {
                if (!credential) {
                    throw new Error('Failed to create credential');
                }

                const pubKeyCred = credential as PublicKeyCredential;
                const attestationResponse = pubKeyCred.response as AuthenticatorAttestationResponse;

                const response = {
                    id: pubKeyCred.id,
                    rawId: arrayBufferToBase64Url(pubKeyCred.rawId),
                    type: pubKeyCred.type,
                    response: {
                        attestationObject: arrayBufferToBase64(attestationResponse.attestationObject),
                        clientDataJSON: arrayBufferToBase64(attestationResponse.clientDataJSON)
                    },
                };

                return fetch(`${import.meta.env.VITE_API_URL}/api/webauthn/register/complete`, {
                    method: 'POST',
                    headers: {
                        'authorization': `Bearer ${accessToken}`,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify(response)
                });
            })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to register credential: ${response.statusText}, ${response.status}`);
                }

                return response.text();
            })
            .then((newToken) => {
                console.log('New Token', newToken, '\nOld Token', accessToken);
                setAccessToken(newToken);
            })
            .catch((error) => {
                console.error(error);
                alert(`Failed to register credential: ${error}`);
            });
    }

    if (!isWebAuthnSupported) {
        return (
            <div className='
        fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-96 min-h-96 bg-stone-900 border-2 border-slate-400 rounded-lg shadow-lg p-8 overflow-auto
        flex flex-col gap-3 justify-around
      '>
                <div>
                    <h1 className='text-2xl font-bold'>WebAuthn Demo</h1>
                    <p>WebAuthn is not supported in this browser.</p>
                </div>
            </div>
        )
    }

    if (!accessToken && !registering) {
        return (
            <div className='
        fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-96 min-h-96 bg-stone-900 border-2 border-slate-400 rounded-lg shadow-lg p-8 overflow-auto
        flex flex-col gap-3 justify-around
      '>
                <div>
                    <h1 className='text-2xl font-bold'>WebAuthn Demo</h1>
                    <p>To get started authenticate.</p>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                    <label htmlFor='username' className='flex items-center'>
                        <input type="text" placeholder='Username' value={username} onChange={(e) => setUsername(e.target.value)} className='p-2 border-2 border-slate-400 rounded-lg w-full' />
                    </label>
                    <label htmlFor='password' className='flex items-center'>
                        <input type="password" placeholder='Password' value={password} onChange={(e) => setPassword(e.target.value)} className='p-2 border-2 border-slate-400 rounded-lg w-full' />
                    </label>
                    <label htmlFor='submit' className='md:col-span-2'>
                        <button className='w-full p-2 bg-slate-400 text-white rounded-lg' onClick={() => login()}>Authenticate</button>
                    </label>
                    <label htmlFor='submit' className='md:col-span-2'>
                        <button className='w-full p-2 bg-slate-400 text-white rounded-lg' onClick={() => loginWebAuthn()}>Authenticate with WebAuthn</button>
                    </label>
                    <button onClick={() => swapAuthType(true)} className='md:col-span-2 p-2 hover:underline text-white rounded-lg'>Register</button>
                </div>
            </div>
        )
    }

    if (!accessToken && registering) {
        return (
            <div className='
        fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-96 min-h-96 bg-stone-900 border-2 border-slate-400 rounded-lg shadow-lg p-8 overflow-auto
        flex flex-col gap-3 justify-around
      '>
                <div>
                    <h1 className='text-2xl font-bold'>WebAuthn Demo</h1>
                    <p>To get started register.</p>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
                    <label htmlFor='username' className='flex items-center'>
                        <input type="text" placeholder='Username' value={username} onChange={(e) => setUsername(e.target.value)} className='p-2 border-2 border-slate-400 rounded-lg w-full' />
                    </label>
                    <label htmlFor='password' className='flex items-center'>
                        <input type="password" placeholder='Password' value={password} onChange={(e) => setPassword(e.target.value)} className='p-2 border-2 border-slate-400 rounded-lg w-full' />
                    </label>
                    <label htmlFor='password' className='flex items-center md:col-span-2'>
                        <input type="text" placeholder="Display Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className='p-2 border-2 border-slate-400 rounded-lg w-full' />
                    </label>
                    <label htmlFor='submit' className='md:col-span-2'>
                        <button className='w-full p-2 bg-slate-400 text-white rounded-lg' onClick={() => register()}>Register</button>
                    </label>
                    <button className='md:col-span-2 p-2 hover:underline text-white rounded-lg' onClick={() => swapAuthType(false)}>Back</button>
                </div>
            </div>
        )
    }

    return (
        <div className='
      fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-96 min-h-96 bg-stone-900 border-2 border-slate-400 rounded-lg shadow-lg p-8 overflow-auto
      flex flex-col gap-3 justify-around
    '>
            <div>
                <h1 className='text-2xl font-bold'>WebAuthn Demo</h1>
                <p>Now let's register biometric authentication.</p>
            </div>
            <button type="button" className='p-2 bg-slate-400 text-white rounded-lg' onClick={() => registerWebAuthn()}>Register</button>
            <button type="button" className='p-2 hover:underline text-white rounded-lg' onClick={() => setAccessToken(null)}>Logout</button>
        </div>
    )
}

export default App
