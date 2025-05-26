import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Powerhouse Academy',
  tagline: 'Get started with the Powerhouse ecosystem',
  favicon: 'img/ph-icon-light.svg',

  // Set the production url of your site here
  url: 'https://powerhouse.academy',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: '', // Usually your GitHub org/user name.
  projectName: '', // Usually your repo name.

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,
  onBrokenAnchors: 'ignore',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/powerhouse-inc/powerhouse-docs/tree/dev',
          showLastUpdateTime: false,
          showLastUpdateAuthor: false,
        },
        theme: {
          customCss: './src/css/custom.css',
        },
        blog: {
          showReadingTime: false,
          editUrl:
            'https://github.com/powerhouse-inc/powerhouse-docs/tree/dev',
          onInlineAuthors: 'ignore',
          showLastUpdateTime: false,
          showLastUpdateAuthor: false,
        },
        sitemap: {
          changefreq: 'weekly',
          priority: 0.5,
          ignorePatterns: ['/tags/**'],
          filename: 'sitemap.xml',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    algolia: {
      appId: '2P4JJIQAAV',
      apiKey: 'b5d796c3c48626f107dabdcb1cd77f29',
      indexName: 'staging-powerhouse',
      contextualSearch: true,
    },
    navbar: {
      title: '',
      logo: {
        alt: 'My Site Logo',
        src: 'img/Powerhouse-main.svg',
        srcDark: 'img/Powerhouse-main-light.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'academySidebar',
          position: 'left',
          label: 'Academy',
        },
        {
          type: 'docSidebar',
          sidebarId: 'bookofpowerhouseSidebar',
          position: 'left',
          label: 'Book of Powerhouse',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
        {
          href: 'https://github.com/powerhouse-inc/powerhouse-docs',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Connect',
              to: 'docs/academy/Architecture/PowerhouseArchitecture',
            },
            {
              label: 'Reactor',
              to: 'docs/academy/Architecture/PowerhouseArchitecture',
            },
            {
              label: 'Switchboard',
              to: 'docs/academy/Architecture/PowerhouseArchitecture',
            },
            {
              label: 'Renown',
              to: 'docs/academy/Architecture/PowerhouseArchitecture',
            },
            {
              label: 'FAQ',
              to: 'docs/academy/Architecture/PowerhouseArchitecture',
            },
            {
              label: "Blog",
              to: '/blog'
            }
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Discord',
              href: 'https://discord.gg/h7GKvqDyDP',
            },
            {
              label: 'X',
              href: 'https://x.com/PowerhouseDAO',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/powerhouse-inc',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Powerhouse, Inc.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
