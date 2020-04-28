function solution(num) {
    const acc_num = num;
    const acc_num_arry = acc_num.toString().split('').map(item => {
        return parseInt(item, 10);
    });
    console.log(acc_num_arry);
    const shuffled_acc_num = acc_num_arry.reduce((accumulator, currentValue, currentIndex, array) => {
        const arr = (currentIndex % 2 ? array.slice().reverse() : array);
        return accumulator.concat(arr[Math.floor(currentIndex / 2)]);
    },[]).join('');
    console.log(shuffled_acc_num);
    return shuffled_acc_num;
}
solution(123456)
// console.log();