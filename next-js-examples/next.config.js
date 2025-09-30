// @ts-check

/** @type {import('next').NextConfig} */

const nextConfig = {
    /**
     * Enable static exports for the App Router.
     *
     * @see https://nextjs.org/docs/pages/building-your-application/deploying/static-exports
     */
    // output: "export", // todo: if we want to export the app in the future

    /**
     * Set base path. This is usually the slug of your repository.
     *
     * @see https://nextjs.org/docs/app/api-reference/next-config-js/basePath
     */
    basePath: process.env.BASE_PATH,

    /**
     * Disable server-based image optimization. Next.js does not support
     * dynamic features with static exports.
     *
     * @see https://nextjs.org/docs/pages/api-reference/components/image#unoptimized
     */
    images: {
        unoptimized: true,
    },

    env: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
        LLM_HOST: process.env.LLM_HOST,
    },
    reactStrictMode: false,
}

module.exports = nextConfig
