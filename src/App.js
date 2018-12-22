import React, { Component } from 'react';
import './App.css';

class App extends Component {
  render() {
    return (
      <div class='container'>
        <div class='row justify-content-center'>
          <div class='col'>
            <div class='typewriter'>
              <h1>Syed Abutalib | Developer</h1>
            </div>
            <section>
              <h1 class='titles'> Hey, Syed here! </h1>
              <p>Hey y'all, I'm Syed! Back in high school I did programming competitions, as well as other tech-related competitions.</p>
              <p>I am currently a freshman at the University of Texas at Dallas, studying CS. I'm hoping to meet all kinds of people there while learning and having as much fun as I can.</p>
              <p>In Summer 2018 I interned at Kalkomey, where I helped create a fishing app for the State of Nevada!</p>
              <p>Currently looking for any tech jobs during the school year, as well as in the Summers.</p>
              <p>If you're still reading, feel free to message me and tell me how to make this website better! I'm open to all suggestions!</p>
            </section>
            <section>
              <h1 class='titles'>Skills</h1>
              <p>HTML, JS, CSS, Bootstrap<br/>Python, Java, Ruby, <br/>Flask, Rails, React, <br/>React Native, Android</p>
              <p>Git, ssh, <br/>Whatever you want me to do.</p>
            </section>
            <section>
              <h1 class='titles'>Experience</h1>
              <p>Kalkomey / Intern</p>
              <p class='sad'>Summer 2018</p>
            </section>
            <section>
              <h1 class='titles'>Contact</h1>
              <a class='sad' href="https://twitter.com/SyedIsSoHot">Twitter</a>
              <a class='sad' href="https://github.com/SyedAbutalib">Github</a>
              <a class='sad' href="mailto:SyedAbutalib589@gmail.com">Email</a>
            </section>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
