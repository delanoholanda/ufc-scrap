
"use client";

import { useState, useEffect } from 'react';

const USERNAME_KEY = 'sigaa_username';
const PASSWORD_KEY = 'sigaa_password';

export function useCredentials() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem(USERNAME_KEY) || '';
      const storedPass = localStorage.getItem(PASSWORD_KEY) || '';
      setUsername(storedUser);
      setPassword(storedPass);
    } catch (error) {
      console.error("Failed to access localStorage:", error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const saveCredentials = (newUser: string, newPass: string) => {
    try {
        localStorage.setItem(USERNAME_KEY, newUser);
        localStorage.setItem(PASSWORD_KEY, newPass);
        setUsername(newUser);
        setPassword(newPass);
    } catch (error) {
        console.error("Failed to save credentials to localStorage:", error);
    }
  };

  return { username, password, saveCredentials, isLoaded };
}
