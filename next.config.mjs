import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  additionalPrecacheEntries: [
    {
      url: '/offline',
      revision: process.env.VERCEL_GIT_COMMIT_SHA || 'development',
    },
  ],
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  cacheOnNavigation: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === 'development',
})

export default withSerwist({
  reactStrictMode: true,
})
