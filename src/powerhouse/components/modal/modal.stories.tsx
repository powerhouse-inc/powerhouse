import { DropdownMenu } from '@/powerhouse';
import { useArgs } from '@storybook/preview-api';
import { Meta, StoryObj } from '@storybook/react';
import { Modal } from '.';

const meta = {
    title: 'Powerhouse/Components/Modal',
    component: Modal,
    parameters: {
        layout: 'fullscreen',
    },
} satisfies Meta<typeof Modal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        open: true,
    },
    render: function Wrapper(args) {
        const [, setArgs] = useArgs<typeof args>();

        return (
            <div className="bg-white">
                <Modal
                    {...args}
                    open={args.open}
                    onOpenChange={open => {
                        setArgs({ ...args, open });
                    }}
                >
                    <div>
                        <DropdownMenu
                            onItemClick={id => alert(id)}
                            className="mb-3 block items-center justify-center rounded bg-blue-500 text-white"
                            menuClassName="border-2 border-indigo-600 w-64 rounded bg-white cursor-pointer"
                            menuItemClassName="hover:bg-gray-200 px-2"
                            items={[
                                {
                                    id: 'item-1',
                                    content: 'Item 1',
                                },
                                {
                                    id: 'item-2',
                                    content: 'Item 2',
                                },
                                {
                                    id: 'item-3',
                                    content: 'Item 3',
                                },
                            ]}
                        >
                            open menu
                        </DropdownMenu>
                        lorem ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem voluptas
                        lorem ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem voluptas
                        lorem ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem voluptaslorem
                        ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem voluptaslorem
                        ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem voluptaslorem
                        ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem voluptaslorem
                        ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem voluptaslorem
                        ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem voluptaslorem
                        ipsum dolor sit amet consectetur adipisicing elit.
                        Quisquam quod, voluptatum, quae voluptatem
                        voluptasloremquae voluptatem voluptaslorem ipsum dolor
                        sit amet consectetur adipisicing elit. Quisquam quod,
                        voluptatum, quae voluptatem voluptaslorem ipsum dolor
                        sit amet consectetur adipisicing elit. Quisquam quod,
                        voluptatum, quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptasloremquae voluptatem
                        voluptaslorem ipsum dolor sit amet consectetur
                        adipisicing elit. Quisquam quod, voluptatum, quae
                        voluptatem voluptaslorem ipsum dolor sit amet
                        consectetur adipisicing elit. Quisquam quod, voluptatum,
                        quae voluptatem voluptaslorem
                    </div>
                </Modal>
                <button
                    onClick={() => {
                        setArgs({ ...args, open: true });
                    }}
                >
                    Open modal
                </button>
            </div>
        );
    },
};
