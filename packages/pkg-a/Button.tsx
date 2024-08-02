import React from 'react';

export interface ButtonProps {
  onClick: () => void;
}

export const TEST_A = 11;

export const Button: React.FC<ButtonProps> = ({ onClick }) => (
  <button onClick={onClick}>Button A</button>
);
