import type { Meta, StoryObj } from '@storybook/react';

const { meta, CreateDocumentStory: Empty }: {
  meta: Meta<any>;
  CreateDocumentStory: StoryObj<any>;
} = /* your existing assignment */;

export default { ...meta, title: "Generic Drive Explorer" } as Meta<any>; 