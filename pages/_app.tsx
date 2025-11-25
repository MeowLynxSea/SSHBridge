import type { AppProps } from 'next/app';
import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>SSHBridge - TUNNEL MANAGEMENT</title>
        <meta name="description" content="SSH Tunnel Management System" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}