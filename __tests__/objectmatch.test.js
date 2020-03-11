import { personObject } from "../src/objectmatch";

it('object match using toMatchObject', () => {
    const expectedObject = {
        person: {
            "name": 'john',
            age: "30",
            gender: "male"
        }
    }
    expect(personObject()).toMatchObject(expectedObject);
});