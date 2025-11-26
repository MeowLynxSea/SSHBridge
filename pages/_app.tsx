import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';
import '../lib/i18n';
import { AuthProvider } from '../components/AuthContext.js';
import { OtpProvider } from '../components/OtpContext.js';
import { LanguageProvider } from '../components/LanguageContext.js';
import { ThemeProvider } from '../components/ThemeContext.js';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <OtpProvider>
            <>
              <Head>
                <title>SSHBridge - TUNNEL MANAGEMENT</title>
                <meta name="description" content="SSH Tunnel Management System" />
                <meta
                  name="viewport"
                  content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
                />
              </Head>
              <Component {...pageProps} />
            </>
          </OtpProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
