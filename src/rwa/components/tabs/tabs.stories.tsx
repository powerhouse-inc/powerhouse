import { OTHER, PORTFOLIO, TRANSACTIONS } from '@/rwa/constants';
import { TabComponents } from '@/rwa/types';
import type { Meta, StoryObj } from '@storybook/react';
import { RWATabs } from './tabs';

const meta: Meta<typeof RWATabs> = {
    title: 'RWA/Components/Tabs',
    component: RWATabs,
};

export default meta;
type Story = StoryObj<typeof meta>;

const tabComponents: TabComponents = [
    {
        value: PORTFOLIO,
        label: 'Portfolio',
        disabled: false,
        Component: () => (
            <div className="bg-slate-50">
                <h1>Portfolio Content</h1>
                <p>
                    Lorem, ipsum dolor sit amet consectetur adipisicing elit.
                    Perferendis, dignissimos, recusandae libero hic et ex iusto
                    dolorum reprehenderit aliquid maxime eligendi.
                    Necessitatibus libero blanditiis tempore exercitationem
                    ratione quod debitis facere atque incidunt. Culpa minus,
                    deserunt provident id rem nam commodi dolore cum ut
                    doloribus atque quaerat doloremque voluptatem dolor. Maiores
                    quae eligendi earum dolorum numquam! Ducimus, consectetur
                    velit libero laboriosam molestias tempora deserunt commodi
                    repudiandae praesentium quibusdam dolore rerum sapiente,
                    officia expedita iste. Ipsum magni velit esse iste optio
                    minus tempore neque tempora impedit iure? Consectetur enim
                    repudiandae commodi similique ipsa nobis consequuntur qui,
                    quod, perferendis, ratione quos quisquam saepe.
                </p>
            </div>
        ),
    },
    {
        value: TRANSACTIONS,
        label: 'Transactions',
        disabled: false,
        Component: () => (
            <div className="bg-slate-50">
                <h1>Transactions Content</h1>
                <p>
                    Lorem, ipsum dolor sit amet consectetur adipisicing elit.
                    Perferendis, dignissimos, recusandae libero hic et ex iusto
                    dolorum reprehenderit aliquid maxime eligendi.
                    Necessitatibus libero blanditiis tempore exercitationem
                    ratione quod debitis facere atque incidunt. Culpa minus,
                    deserunt provident id rem nam commodi dolore cum ut
                    doloribus atque quaerat doloremque voluptatem dolor. Maiores
                    quae eligendi earum dolorum numquam! Ducimus, consectetur
                    velit libero laboriosam molestias tempora deserunt commodi
                    repudiandae praesentium quibusdam dolore rerum sapiente,
                    officia expedita iste. Ipsum magni velit esse iste optio
                    minus tempore neque tempora impedit iure? Consectetur enim
                    repudiandae commodi similique ipsa nobis consequuntur qui,
                    quod, perferendis, ratione quos quisquam saepe.
                </p>
            </div>
        ),
    },
    {
        value: OTHER,
        label: 'Other',
        disabled: false,
        Component: () => (
            <div className="bg-slate-50">
                <h1>Other Content</h1>
                <p>
                    Lorem, ipsum dolor sit amet consectetur adipisicing elit.
                    Perferendis, dignissimos, recusandae libero hic et ex iusto
                    dolorum reprehenderit aliquid maxime eligendi.
                    Necessitatibus libero blanditiis tempore exercitationem
                    ratione quod debitis facere atque incidunt. Culpa minus,
                    deserunt provident id rem nam commodi dolore cum ut
                    doloribus atque quaerat doloremque voluptatem dolor. Maiores
                    quae eligendi earum dolorum numquam! Ducimus, consectetur
                    velit libero laboriosam molestias tempora deserunt commodi
                    repudiandae praesentium quibusdam dolore rerum sapiente,
                    officia expedita iste. Ipsum magni velit esse iste optio
                    minus tempore neque tempora impedit iure? Consectetur enim
                    repudiandae commodi similique ipsa nobis consequuntur qui,
                    quod, perferendis, ratione quos quisquam saepe.
                </p>
            </div>
        ),
    },
];

export const Primary: Story = {
    args: {
        tabComponents,
        canUndo: false,
        canRedo: false,
        onClose: () => {},
        onExport: () => {},
        undo: () => {},
        redo: () => {},
        onShowRevisionHistory: () => {},
        onSwitchboardLinkClick: () => {},
    },
    decorators: [
        Story => (
            <div className="h-screen w-full bg-white">
                <Story />
            </div>
        ),
    ],
};
