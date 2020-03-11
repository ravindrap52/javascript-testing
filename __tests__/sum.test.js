import { sum } from "../src/sum";
console.log(sum);

it('add two numbers', () => {
    expect(sum(1,2)).toBe(3);
})