import React from 'react';
import { Button } from '@pgph/pkg-a';

export const TEST_B = 10;

export const Panel: React.FC = () => (
  <div style={{ backgroundColor: 'yellow', padding: '20px' }}>
    <h2>Panel</h2>
    <Button onClick={() => console.log('pkg-b')} />
  </div>
);
