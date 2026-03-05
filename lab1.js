let x=14;
let y = 23;
const sabit= 33;
let text = "Hello World";

//tiplerin consolda gorunmesi
console.log("x -",typeof x);
console.log("y -",typeof y);
console.log("sabit -",typeof sabit);
console.log("text -",typeof text);


//yeni deyerlerin hesablanmasi
x = x % 9;
y = y % 8;
let yeniSabit = sabit +5;


//neticelerin gosterilmesi
console.log("x ve y cemi:", x+y);
console.log("(sabit - x)/ y:", (yeniSabit-x)/y);


//sert bloku
if (x>y) {
    console.log("x y-den boyukdur");

}   else if (y>x){
    console.log("y x-den boyukdur");
}
    else {
        console.log("x y-beraberdir");
    }
