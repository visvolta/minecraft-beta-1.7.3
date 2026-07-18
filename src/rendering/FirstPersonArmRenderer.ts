import { Scene, Group, Mesh, BoxGeometry, MeshBasicMaterial, PerspectiveCamera } from 'three';

export class FirstPersonArmRenderer {
  public readonly scene = new Scene();
  private readonly armGroup = new Group();

  public constructor() {
    const px = 1 / 16;
    const matArm = new MeshBasicMaterial({ color: 0xffccaa });
    
    // First person arm is the right arm, 4x12x4.
    const armGeo = new BoxGeometry(4 * px, 12 * px, 4 * px);
    const armMesh = new Mesh(armGeo, matArm);
    
    // Position it so the pivot is at the shoulder.
    armMesh.position.set(0, -6 * px, 0); 
    this.armGroup.add(armMesh);

    // Initial default placement
    this.scene.add(this.armGroup);
  }

  public setVisible(visible: boolean): void {
    this.armGroup.visible = visible;
  }

  /**
   * Updates the arm's transform relative to the camera.
   * Matches Beta 1.7.3 ItemRenderer.renderItemInFirstPerson hand placement loosely.
   */
  public update(camera: PerspectiveCamera): void {
    // The arm must follow the camera strictly. We can parent the arm to the camera,
    // or just copy the camera's world matrix. In a separate scene, it's easier to
    // copy the camera transform and apply local offsets.
    
    // First, align the arm's base group exactly with the camera
    this.armGroup.position.copy(camera.position);
    this.armGroup.quaternion.copy(camera.quaternion);

    // Now apply local offset relative to the camera to place the arm in the lower-right.
    // Classic Beta offsets: translated down, right, and slightly forward.
    this.armGroup.translateX(0.5);  // Move to the right
    this.armGroup.translateY(-0.6); // Move down
    this.armGroup.translateZ(-0.8); // Move forward (into the screen)

    // And rotate to point forward
    this.armGroup.rotateX(-Math.PI / 4); // Slant it up a bit
    this.armGroup.rotateY(-Math.PI / 8); // Slant it left a bit
    this.armGroup.rotateZ(Math.PI / 16); 
  }
}
